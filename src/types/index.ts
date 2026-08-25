export interface Command {
  name: string;
  description: string;
}

export interface Section {
  title: string;
  commands: Command[];
}

export type Theme = 'terminal' | 'card';

export interface CLIData {
  title: string;
  /** Rendered under the title in the card theme. Ignored by the terminal theme. */
  subtitle?: string;
  /** Visual style. Defaults to 'terminal' so existing data files keep working. */
  theme?: Theme;
  /** Quick tips joined with " · " in the card theme footer. */
  footerTips?: string[];
  sections: Section[];
}

export interface Resolution {
  width: number;
  height: number;
  name: string;
}

export const RESOLUTIONS: Resolution[] = [
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 2560, height: 1440, name: '2560x1440' },
  { width: 3440, height: 1440, name: '3440x1440' },
  { width: 3840, height: 2160, name: '3840x2160' }
];
