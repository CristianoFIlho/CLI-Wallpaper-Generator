import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { CLIData, Resolution, RESOLUTIONS, Theme } from './types';

export class WallpaperGenerator {
  private templatesPath: string;
  private outputPath: string;

  constructor() {
    this.templatesPath = path.join(__dirname, 'templates');
    this.outputPath = path.join(process.cwd(), 'output');
  }

  /**
   * Resolve the theme for a CLI, defaulting to the original terminal look
   */
  private themeOf(data: CLIData): Theme {
    return data.theme === 'card' ? 'card' : 'terminal';
  }

  /**
   * Template file backing a theme
   */
  private templatePathFor(theme: Theme): string {
    const file = theme === 'card' ? 'template-card.html' : 'template.html';
    return path.join(this.templatesPath, file);
  }

  /**
   * Escape text that gets interpolated into the HTML template, so that command
   * placeholders such as `git clone <url>` survive instead of being parsed as markup.
   */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Replace every occurrence of a placeholder. String.replace only swaps the
   * first one, which used to leave a literal {{TITLE}} in the rendered header.
   */
  private fill(template: string, token: string, value: string): string {
    return template.split(token).join(value);
  }

  /**
   * Load CLI data from JSON file
   */
  private loadCLIData(cliName: string): CLIData {
    const dataPath = path.join(__dirname, 'data', `${cliName}.json`);
    const data = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(data) as CLIData;
  }

  /**
   * Generate HTML sections from CLI data
   */
  private generateSections(data: CLIData): string {
    if (this.themeOf(data) === 'card') {
      return this.generateCardSections(data);
    }

    return data.sections.map(section => {
      const commands = section.commands.map(command => `
        <div class="command">
          <div class="command-name">${this.escapeHtml(command.name)}</div>
          <div class="command-desc">${this.escapeHtml(command.description)}</div>
        </div>
      `).join('');

      return `
        <div class="column">
          <div class="section">
            <div class="section-title">${this.escapeHtml(section.title)}</div>
            ${commands}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Card theme markup: a header pill plus a panel of stacked command/description pairs
   */
  private generateCardSections(data: CLIData): string {
    return data.sections.map(section => {
      const commands = section.commands.map(command => `
          <div class="command">
            <div class="command-name">${this.escapeHtml(command.name)}</div>
            <div class="command-desc">${this.escapeHtml(command.description)}</div>
          </div>`).join('');

      return `
      <div class="card">
        <div class="card-header">${this.escapeHtml(section.title)}</div>
        <div class="card-body">${commands}
        </div>
      </div>`;
    }).join('');
  }

  /**
   * Generate HTML content from template and data
   */
  private generateHTML(data: CLIData, resolution: Resolution): string {
    const template = fs.readFileSync(this.templatePathFor(this.themeOf(data)), 'utf8');
    const sections = this.generateSections(data);
    const footer = (data.footerTips ?? []).join(' · ');

    // Placeholders absent from a template simply have nothing to replace.
    let html = this.fill(template, '{{TITLE}}', this.escapeHtml(data.title));
    html = this.fill(html, '{{SUBTITLE}}', this.escapeHtml(data.subtitle ?? ''));
    html = this.fill(html, '{{FOOTER}}', this.escapeHtml(footer));
    html = this.fill(html, '{{RESOLUTION}}', resolution.name);
    html = this.fill(html, '{{SECTIONS}}', sections);
    return html;
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDir(cliName: string): void {
    const cliOutputDir = path.join(this.outputPath, cliName);
    if (!fs.existsSync(cliOutputDir)) {
      fs.mkdirSync(cliOutputDir, { recursive: true });
    }
  }

  /**
   * Generate screenshot for specific resolution
   */
  private async generateScreenshot(
    html: string,
    resolution: Resolution,
    cliName: string,
    theme: Theme
  ): Promise<void> {
    const browser = await chromium.launch({
      headless: true
    });

    try {
      const page = await browser.newPage();
      await page.setViewportSize({
        width: resolution.width,
        height: resolution.height
      });

      await page.setContent(html, { waitUntil: 'networkidle' });

      // The card theme is laid out to fill the viewport exactly, so it is clipped
      // to it rather than captured full-page. Anything that does not fit would be
      // silently cropped, so fail loudly instead.
      if (theme === 'card') {
        // A multi-column container clips overflowing cards without growing
        // scrollHeight, so compare each card's geometry against the container's.
        const overflow = await page.evaluate(() => {
          const container = document.querySelector('.cards');
          if (!container) return { x: 0, y: 0 };

          const box = container.getBoundingClientRect();
          let x = 0;
          let y = 0;

          for (const card of Array.from(document.querySelectorAll('.card'))) {
            const rect = card.getBoundingClientRect();
            y = Math.max(y, Math.ceil(rect.bottom - box.bottom));
            x = Math.max(x, Math.ceil(rect.right - box.right));
          }

          return { x, y };
        });

        if (overflow.y > 0 || overflow.x > 0) {
          throw new Error(
            `Cards overflow the ${resolution.name} layout by ${overflow.x}px horizontally ` +
            `and ${overflow.y}px vertically — trim commands or tighten the scale.`
          );
        }
      }

      const outputDir = path.join(this.outputPath, cliName);
      const filename = `${cliName}-${resolution.name}.png`;
      const filepath = path.join(outputDir, filename);

      await page.screenshot({
        path: filepath,
        fullPage: theme !== 'card',
        type: 'png'
      });

      console.log(`✓ Generated ${filename}`);
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate wallpapers for a specific CLI
   */
  async generateForCLI(cliName: string): Promise<void> {
    console.log(`\n🎨 Generating wallpapers for ${cliName}...`);
    
    try {
      const data = this.loadCLIData(cliName);
      const theme = this.themeOf(data);
      this.ensureOutputDir(cliName);

      // Generate screenshots for all resolutions
      for (const resolution of RESOLUTIONS) {
        const html = this.generateHTML(data, resolution);
        await this.generateScreenshot(html, resolution, cliName, theme);
      }

      console.log(`✅ Successfully generated ${RESOLUTIONS.length} wallpapers for ${cliName}`);
    } catch (error) {
      console.error(`❌ Error generating wallpapers for ${cliName}:`, error);
      throw error;
    }
  }

  /**
   * Generate wallpapers for all available CLIs
   */
  async generateAll(): Promise<void> {
    const availableCLIs = ['salesforce', 'git', 'docker', 'kubernetes', 'npm'];
    
    console.log('🚀 Generating wallpapers for all CLI tools...');
    
    for (const cliName of availableCLIs) {
      await this.generateForCLI(cliName);
    }
    
    console.log('\n🎉 All wallpapers generated successfully!');
  }

  /**
   * List available CLI tools
   */
  listAvailableCLIs(): string[] {
    const dataDir = path.join(__dirname, 'data');
    return fs.readdirSync(dataDir)
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
  }
}
