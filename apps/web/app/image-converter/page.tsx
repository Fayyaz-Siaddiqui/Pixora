import { ToolPage } from '@/components/layout/tool-page';
import { ConverterTool } from '@/features/converter/converter-tool';
import { toolMetadata } from '@/lib/seo';
import { toolByHref } from '@/lib/tools';

export const metadata = toolMetadata('/image-converter');

export default function Page() {
  return (
    <ToolPage
      tool={toolByHref('/image-converter')}
      intro="Convert between JPG, PNG, WebP and AVIF, one image or many at once. Transparency is kept whenever the new format supports it."
      about={[
        { q: 'What happens to transparent backgrounds?', a: 'PNG, WebP and AVIF keep transparency. JPG cannot store it, so when you convert a transparent image to JPG we ask for a background colour and show it to you. Transparency is never removed silently.' },
        { q: 'Which format should I choose?', a: 'JPG works everywhere and suits photos. PNG is lossless and best for graphics and screenshots. WebP is smaller than both and supports transparency. AVIF usually gives the smallest files and is supported by current browsers.' },
        { q: 'Can I convert many files at once?', a: 'Yes. Select several images, convert them in one go and download them individually or as a single ZIP.' },
        { q: 'Which files can I upload?', a: 'JPG, PNG, WebP, AVIF, GIF and TIFF. We check each file’s real content, so a renamed file is detected correctly. Animated images use their first frame.' },
      ]}
    >
      <ConverterTool />
    </ToolPage>
  );
}
