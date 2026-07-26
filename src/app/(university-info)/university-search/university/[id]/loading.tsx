import { UniversityInformation } from '@/components/university-search/university-information';
import { PAGE_BODY_IN_SHELL } from './_components/page-body';

export default function LoadingUniversityPage() {
  return <UniversityInformation loading className={PAGE_BODY_IN_SHELL} />;
}
