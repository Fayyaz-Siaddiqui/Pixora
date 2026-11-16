import { ToolPage } from '@/components/layout/tool-page';
import { MetadataTool } from '@/features/metadata/metadata-tool';
import { toolMetadata } from '@/lib/seo';
import { toolByHref } from '@/lib/tools';

export const metadata = toolMetadata('/image-metadata-viewer');

export default function Page() {
  return (
    <ToolPage
      tool={toolByHref('/image-metadata-viewer')}
      intro="See what an image file really contains: its true format, dimensions, colour profile, camera EXIF data, and whether it reveals a GPS location."
      about={[
        { q: 'Why check the real format?', a: 'A file’s extension can be wrong. For example, a PNG renamed to .jpg. We identify the format from the file’s content, which is what browsers and editors actually use.' },
        { q: 'Why does GPS location matter?', a: 'Phones often store where a photo was taken. If you share the original file, others can see that location. Images exported from our tools never include GPS data.' },
        { q: 'What is EXIF orientation?', a: 'Cameras often save photos sideways and add a note saying how to rotate them. We apply that note automatically, so your edited images always appear the right way up.' },
      ]}
    >
      <MetadataTool />
    </ToolPage>
  );
}
