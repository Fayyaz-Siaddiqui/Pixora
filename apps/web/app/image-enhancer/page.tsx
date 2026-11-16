import { ToolPage } from '@/components/layout/tool-page';
import { EnhancerTool } from '@/features/enhancer/enhancer-tool';
import { toolMetadata } from '@/lib/seo';
import { toolByHref } from '@/lib/tools';

export const metadata = toolMetadata('/image-enhancer');

export default function Page() {
  return (
    <ToolPage
      tool={toolByHref('/image-enhancer')}
      intro="Fix exposure, contrast and colour with a live before/after preview, then add sharpness or noise reduction. Undo and redo any step."
      about={[
        { q: 'Is this AI enhancement?', a: 'No. These are precise, classic photo adjustments that you control: exposure, contrast, shadows, highlights, white balance and saturation, plus sharpening and noise reduction. They never invent details. AI super-resolution is a separate feature.' },
        { q: 'Will the download look like the preview?', a: 'Yes. The preview uses exactly the same adjustment formulas as the final export, applied to a smaller copy for speed. Sharpness and noise reduction depend on the full resolution, so they are applied during export.' },
        { q: 'What does each slider do?', a: 'Exposure brightens or darkens like a camera setting. Highlights and shadows recover bright or dark areas separately. Temperature makes the image warmer or cooler, tint shifts between green and magenta, and saturation controls colour intensity.' },
        { q: 'Can I go back?', a: 'Yes. Use Undo (Ctrl+Z) and Redo (Ctrl+Shift+Z), double-click a slider to reset it, or reset everything at once. Your original file is never changed.' },
      ]}
    >
      <EnhancerTool />
    </ToolPage>
  );
}
