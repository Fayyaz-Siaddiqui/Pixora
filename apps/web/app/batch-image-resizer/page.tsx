import { ToolPage } from '@/components/layout/tool-page';
import { ResizerTool } from '@/features/resizer/resizer-tool';
import { toolMetadata } from '@/lib/seo';
import { toolByHref } from '@/lib/tools';

export const metadata = toolMetadata('/batch-image-resizer');

export default function Page() {
  return (
    <ToolPage
      tool={toolByHref('/batch-image-resizer')}
      intro="Upload many images, select the ones you want and apply the same size to all of them. Each file is processed separately with its own progress, and you can download everything as one ZIP."
      about={[
        { q: 'Do all images keep their proportions?', a: 'With the aspect-ratio lock on, you set one side (for example a width of 1200 px) and each image keeps its own shape. Unlock it to make every image the exact same size using Fill or Fit.' },
        { q: 'What happens if one image fails?', a: 'Only that image fails. The others finish normally, the problem is explained next to the file, and you can retry it.' },
        { q: 'How many images can I process?', a: 'Up to 50 per batch and 20 per upload. Large batches are processed in a queue, so the page stays responsive.' },
      ]}
    >
      <ResizerTool batchFocus />
    </ToolPage>
  );
}
