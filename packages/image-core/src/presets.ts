export interface SizePreset {
  id: string;
  label: string;
  group: 'Instagram' | 'Facebook' | 'YouTube' | 'LinkedIn' | 'Web';
  width: number;
  height: number;
}

/**
 * Built-in size presets. Platforms change their recommendations over time;
 * these are also seeded into the database so admins can update them without
 * a code change.
 */
export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: 'instagram-square', label: 'Instagram Square', group: 'Instagram', width: 1080, height: 1080 },
  { id: 'instagram-portrait', label: 'Instagram Portrait', group: 'Instagram', width: 1080, height: 1350 },
  { id: 'instagram-landscape', label: 'Instagram Landscape', group: 'Instagram', width: 1080, height: 566 },
  { id: 'facebook-post', label: 'Facebook Post', group: 'Facebook', width: 1200, height: 630 },
  { id: 'facebook-cover', label: 'Facebook Cover', group: 'Facebook', width: 851, height: 315 },
  { id: 'youtube-thumbnail', label: 'YouTube Thumbnail', group: 'YouTube', width: 1280, height: 720 },
  { id: 'youtube-banner', label: 'YouTube Banner', group: 'YouTube', width: 2560, height: 1440 },
  { id: 'linkedin-post', label: 'LinkedIn Post', group: 'LinkedIn', width: 1200, height: 627 },
  { id: 'website-hero', label: 'Website Hero', group: 'Web', width: 1920, height: 1080 },
];
