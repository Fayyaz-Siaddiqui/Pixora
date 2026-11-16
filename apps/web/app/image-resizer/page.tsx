import { ToolPage } from '@/components/layout/tool-page';
import { ResizerTool } from '@/features/resizer/resizer-tool';
import { toolMetadata } from '@/lib/seo';
import { toolByHref } from '@/lib/tools';

export const metadata = toolMetadata('/image-resizer');

export default function Page() {
  return (
    <ToolPage
      tool={toolByHref('/image-resizer')}
      intro="Resize to exact pixels, a percentage or a social-media preset. Proportions are kept unless you choose otherwise, and every result is rendered from your original file."
      about={[
        { q: 'How do you keep quality when resizing?', a: 'Every resize is computed from your original upload (never from an earlier result) with the Lanczos3 filter, and the image is encoded only once. Photo orientation from the camera is applied first, colours are converted correctly to sRGB, and transparency is kept for PNG, WebP and AVIF.' },
        { q: 'What is the difference between Fill, Fit and Stretch?', a: 'Fill covers the exact size and trims what doesn’t fit. Fit shows the whole image and pads the empty space with a colour or transparency. Stretch forces the exact size and distorts the image, so we warn you how much.' },
        { q: 'Can resizing make a small image sharper?', a: 'No. Enlarging with standard resizing spreads the existing pixels over a larger area, so the image gets softer. It cannot recover detail that was never captured. That needs AI super-resolution, which is a separate feature.' },
        { q: 'Are my images private?', a: 'Yes. Your files are visible only to you, are never used for training, and are deleted automatically after 24 hours. You can delete them sooner at any time.' },
      ]}
    >
      <ResizerTool />
    </ToolPage>
  );
}
