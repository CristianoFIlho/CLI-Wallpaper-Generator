import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { WallpaperGenerator } from './generator';
import { RESOLUTIONS } from './types';

const app = express();
const port = process.env.PORT || 3000;
const generator = new WallpaperGenerator();
const apiRouter = express.Router();

apiRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    endpoints: {
      clis: '/api/clis',
      resolutions: '/api/resolutions',
      generate: '/api/generate',
      wallpapers: '/api/wallpapers',
      preview: '/api/preview/:cli/:resolution'
    }
  });
});

apiRouter.get('/clis', (_req: Request, res: Response) => {
  try {
    const clis = generator.listAvailableCLIs();
    res.json({ success: true, data: clis });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

apiRouter.get('/resolutions', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: RESOLUTIONS });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

apiRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const { cli, resolution } = req.body;

    if (!cli || !resolution) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: cli and resolution'
      });
    }

    const availableCLIs = generator.listAvailableCLIs();
    if (!availableCLIs.includes(cli)) {
      return res.status(400).json({
        success: false,
        error: `Invalid CLI: ${cli}`
      });
    }

    const validResolution = RESOLUTIONS.find(r => r.name === resolution);
    if (!validResolution) {
      return res.status(400).json({
        success: false,
        error: `Invalid resolution: ${resolution}`
      });
    }

    await generator.generateForCLI(cli);

    res.json({
      success: true,
      message: `Generated ${cli} wallpaper in ${resolution}`,
      imagePath: `/output/${cli}/${cli}-${resolution}.png`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

apiRouter.get('/wallpapers', (_req: Request, res: Response) => {
  try {
    const fs = require('fs');
    const outputDir = path.join(__dirname, '../output');

    if (!fs.existsSync(outputDir)) {
      return res.json({ success: true, data: [] });
    }

    const wallpapers = [] as Array<{ cli: string; filename: string; path: string; resolution: string }>;
    const cliDirs = fs.readdirSync(outputDir);

    for (const cliDir of cliDirs) {
      const cliPath = path.join(outputDir, cliDir);
      if (fs.statSync(cliPath).isDirectory()) {
        const files = fs
          .readdirSync(cliPath)
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
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

apiRouter.get('/preview/:cli/:resolution', async (req: Request, res: Response) => {
  try {
    const { cli, resolution } = req.params;
    const fs = require('fs');

    const imagePath = path.join(__dirname, '../output', cli, `${cli}-${resolution}.png`);

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
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

apiRouter.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, error: `Unknown API route: ${req.originalUrl}` });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);
app.use('/output', express.static(path.join(__dirname, '../output')));
app.use(express.static(path.join(__dirname, '../web')));

// Serve web interface
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../web/index.html'));
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`📱 Web interface: http://localhost:${port}`);
  console.log(`🔧 API endpoints: http://localhost:${port}/api/*`);
});
