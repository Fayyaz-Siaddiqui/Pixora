import { ToolPage } from '@/components/layout/tool-page';
import { CompressorTool } from '@/features/compressor/compressor-tool';
import { toolMetadata } from '@/lib/seo';
import { toolByHref } from '@/lib/tools';

export const metadata = toolMetadata('/image-compressor');

export default function Page() {
  return (
    <ToolPage
      tool={toolByHref('/image-compressor')}
      intro="Make files smaller without changing their dimensions. Pick a quality level or a target size, see exactly how much you saved, and compare before downloading."
      about={[
        { q: 'Which setting should I use?', a: 'Balanced suits most photos and websites. Best keeps the highest quality for printing or editing later. Smallest is for when size matters most. Custom lets you set the exact quality.' },
        { q: 'How does the target size work?', a: 'We search for the highest quality that fits under your target. If the target can only be reached by making the image look poor, we stop at a sensible minimum and tell you, rather than giving you a broken-looking file. Reducing the dimensions is the better way to go smaller then.' },
        { q: 'Why can’t PNG use a target size?', a: 'PNG is lossless, so its size depends on the picture rather than a quality setting. The “Smallest” option reduces PNG colours instead, which works well for graphics. For photos, WebP or AVIF give much smaller files.' },
        { q: 'Is my photo’s location removed?', a: 'Yes. All metadata is removed by default. If you choose to keep photo details, only camera, author and date are kept; GPS location is always removed.' },
      ]}
    >
      <CompressorTool />
    </ToolPage>
  );
}
