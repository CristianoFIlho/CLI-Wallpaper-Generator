import { VercelRequest, VercelResponse } from '@vercel/node';
import cors from 'cors';
import path from 'path';

// Mock data for CLI tools
const CLI_TOOLS = ['docker', 'git', 'kubernetes', 'npm', 'salesforce'];

// Mock resolutions
const RESOLUTIONS = [
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 2560, height: 1440, name: '2560x1440' },
  { width: 3440, height: 1440, name: '3440x1440' },
  { width: 3840, height: 2160, name: '3840x2160' }
];

// Check if we're in a serverless environment
const isServerless = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Try to import Playwright only in non-serverless environments
let WallpaperGenerator: any = null;
let generator: any = null;

if (!isServerless) {
  try {
    const { WallpaperGenerator: WG } = require('../src/generator');
    WallpaperGenerator = WG;
    generator = new WallpaperGenerator();
  } catch (error) {
    console.log('Playwright not available, using mock mode');
  }
}

// Helper function to handle CORS
const corsHandler = cors();

// API Routes
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  corsHandler(req, res, () => {});

  const { method, url } = req;

  try {
    switch (true) {
      case method === 'GET' && url === '/api/clis':
        return handleGetCLIs(req, res);
      
      case method === 'GET' && url === '/api/resolutions':
        return handleGetResolutions(req, res);
      
      case method === 'POST' && url === '/api/generate':
        return handleGenerate(req, res);
      
      case method === 'GET' && url === '/api/wallpapers':
        return handleGetWallpapers(req, res);
      
      case method === 'GET' && url?.startsWith('/api/preview/'):
        return handlePreview(req, res);
      
      default:
        res.status(404).json({ success: false, error: 'Not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

async function handleGetCLIs(req: VercelRequest, res: VercelResponse) {
  try {
    if (generator) {
      const clis = generator.listAvailableCLIs();
      res.json({ success: true, data: clis });
    } else {
      res.json({ success: true, data: CLI_TOOLS });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

async function handleGetResolutions(req: VercelRequest, res: VercelResponse) {
  try {
    res.json({ success: true, data: RESOLUTIONS });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

async function handleGenerate(req: VercelRequest, res: VercelResponse) {
  try {
    const { cli, resolution } = req.body;
    
    if (!cli || !resolution) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: cli and resolution' 
      });
    }

    // Validate CLI exists
    const availableCLIs = generator ? generator.listAvailableCLIs() : CLI_TOOLS;
    if (!availableCLIs.includes(cli)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid CLI: ${cli}` 
      });
    }

    // Validate resolution
    const validResolution = RESOLUTIONS.find(r => r.name === resolution);
    if (!validResolution) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid resolution: ${resolution}` 
      });
    }

    if (generator && !isServerless) {
      // Generate wallpaper using Playwright (local development)
      await generator.generateForCLI(cli);
      res.json({ 
        success: true, 
        message: `Generated ${cli} wallpaper in ${resolution}`,
        imagePath: `/output/${cli}/${cli}-${resolution}.png`
      });
    } else {
      // Serverless environment - return mock response
      res.json({ 
        success: true, 
        message: `Generated ${cli} wallpaper in ${resolution}`,
        imagePath: `/output/${cli}/${cli}-${resolution}.png`,
        note: 'Wallpaper generation is available in local development. For production, consider using a dedicated image generation service.',
        environment: 'serverless'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

async function handleGetWallpapers(req: VercelRequest, res: VercelResponse) {
  try {
    if (generator && !isServerless) {
      // Use real file system in local development
      const fs = require('fs');
      const outputDir = path.join(process.cwd(), 'output');
      
      if (!fs.existsSync(outputDir)) {
        return res.json({ success: true, data: [] });
      }

      const wallpapers = [];
      const cliDirs = fs.readdirSync(outputDir);
      
      for (const cliDir of cliDirs) {
        const cliPath = path.join(outputDir, cliDir);
        if (fs.statSync(cliPath).isDirectory()) {
          const files = fs.readdirSync(cliPath)
            .filter((file: string) => file.endsWith('.png'))
            .map((file: string) => ({
              cli: cliDir,
              filename: file,
              path: `/output/${cliDir}/${file}`,
              resolution: file.replace(`${cliDir}-`, '').replace('.png', '')
            }));
          wallpapers.push(...files);
        }
      }

      res.json({ success: true, data: wallpapers });
    } else {
      // Return mock wallpapers for serverless environment
      const mockWallpapers = [];
      
      for (const cli of CLI_TOOLS) {
        for (const resolution of RESOLUTIONS) {
          mockWallpapers.push({
            cli: cli,
            filename: `${cli}-${resolution.name}.png`,
            path: `/output/${cli}/${cli}-${resolution.name}.png`,
            resolution: resolution.name
          });
        }
      }

      res.json({ success: true, data: mockWallpapers });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

async function handlePreview(req: VercelRequest, res: VercelResponse) {
  try {
    const { cli, resolution } = req.query as { cli: string; resolution: string };
    
    if (generator && !isServerless) {
      // Check if wallpaper exists in local development
      const imagePath = path.join(process.cwd(), 'output', cli, `${cli}-${resolution}.png`);
      const fs = require('fs');
      
      if (!fs.existsSync(imagePath)) {
        return res.status(404).json({ 
          success: false, 
          error: 'Wallpaper not found. Generate it first.' 
        });
      }

      res.json({ 
        success: true, 
        imagePath: `/output/${cli}/${cli}-${resolution}.png`
      });
    } else {
      // Serverless environment - return mock preview
      res.json({ 
        success: true, 
        imagePath: `/output/${cli}/${cli}-${resolution}.png`,
        note: 'Preview available in local development environment'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}