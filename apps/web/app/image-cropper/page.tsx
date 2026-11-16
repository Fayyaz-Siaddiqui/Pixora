import { ToolPage } from '@/components/layout/tool-page';
import { CropperTool } from '@/features/cropper/cropper-tool';
import { toolMetadata } from '@/lib/seo';
import { toolByHref } from '@/lib/tools';

export const metadata = toolMetadata('/image-cropper');

export default function Page() {
  return (
    <ToolPage
      tool={toolByHref('/image-cropper')}
      intro="Drag the box to crop freely or to a fixed ratio. Rotate, flip, make a circle for profile pictures, or type exact pixel positions."
      about={[
        { q: 'How do I crop to an exact size?', a: 'Choose a ratio (or “Free” and type the width and height under “Exact position & size”). To get a specific final size such as 1080 × 1080, also fill in “Output size”.' },
        { q: 'How does the circle crop work?', a: 'Everything outside the circle becomes transparent. Save it as PNG, WebP or AVIF to keep that transparency; JPG would fill the corners with a colour.' },
        { q: 'Does rotating reduce quality?', a: 'Rotating by 90° steps and flipping move pixels without resampling, so no quality is lost. The crop is then taken from your original file.' },
        { q: 'Can I use the keyboard?', a: 'Yes. Focus the crop box and use the arrow keys to move it by one pixel, or hold Shift to move ten pixels at a time.' },
      ]}
    >
      <CropperTool />
    </ToolPage>
  );
}
