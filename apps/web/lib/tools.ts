import { Crop, FileDown, FileSearch, Layers, RefreshCcw, Scaling, SlidersHorizontal, type LucideIcon } from 'lucide-react';

export interface ToolInfo {
  href: string;
  name: string;
  /** One-line summary for cards and menus. */
  summary: string;
  /** Page <title> and meta description. */
  seoTitle: string;
  seoDescription: string;
  Icon: LucideIcon;
}

/** Only tools that are fully implemented are listed here. */
export const TOOLS: ToolInfo[] = [
  {
    href: '/image-resizer',
    name: 'Image Resizer',
    summary: 'Exact pixel sizes, percentages and social-media presets with Lanczos3 quality.',
    seoTitle: 'Image Resizer: resize to exact pixels without losing quality',
    seoDescription: 'Resize JPG, PNG, WebP and AVIF images to exact dimensions or percentages. Keep proportions, fill or fit, social-media presets. Free and private.',
    Icon: Scaling,
  },
  {
    href: '/image-compressor',
    name: 'Image Compressor',
    summary: 'Shrink file size with quality presets or a target size in KB.',
    seoTitle: 'Image Compressor: reduce JPG, PNG, WebP size',
    seoDescription: 'Compress images with best, balanced or smallest presets, or aim for a target size in KB. See the size saved and compare before downloading.',
    Icon: FileDown,
  },
  {
    href: '/image-converter',
    name: 'Image Converter',
    summary: 'Convert between JPG, PNG, WebP and AVIF while keeping transparency.',
    seoTitle: 'Image Converter: JPG, PNG, WebP and AVIF',
    seoDescription: 'Convert images between JPG, PNG, WebP and AVIF. Transparency is preserved where the format supports it. Batch convert and download as ZIP.',
    Icon: RefreshCcw,
  },
  {
    href: '/image-cropper',
    name: 'Image Cropper',
    summary: 'Free or fixed-ratio crop, circle crop, rotate and flip.',
    seoTitle: 'Image Cropper: crop, rotate, flip and circle crop',
    seoDescription: 'Crop images freely or to a fixed aspect ratio, make circular profile pictures, rotate and flip. Exact pixel positions and output size.',
    Icon: Crop,
  },
  {
    href: '/image-enhancer',
    name: 'Image Enhancer',
    summary: 'Exposure, contrast, colour, shadows, highlights, sharpness and noise reduction.',
    seoTitle: 'Image Enhancer: adjust brightness, contrast and colour',
    seoDescription: 'Adjust exposure, brightness, contrast, highlights, shadows, temperature, tint and saturation with a live before/after preview, then sharpen and denoise.',
    Icon: SlidersHorizontal,
  },
  {
    href: '/batch-image-resizer',
    name: 'Batch Resizer',
    summary: 'Resize many images at once with the same settings and download a ZIP.',
    seoTitle: 'Batch Image Resizer: resize many images at once',
    seoDescription: 'Resize up to 50 images at once with the same settings. Each image keeps its proportions. Track progress per file and download everything as a ZIP.',
    Icon: Layers,
  },
  {
    href: '/image-metadata-viewer',
    name: 'Metadata Viewer',
    summary: 'See EXIF data, real format, colour profile and hidden GPS location.',
    seoTitle: 'Image Metadata Viewer and Format Checker',
    seoDescription: 'Inspect EXIF data, the real file format, dimensions, colour space and whether a photo contains GPS location data.',
    Icon: FileSearch,
  },
];

export const toolByHref = (href: string) => TOOLS.find((t) => t.href === href)!;
