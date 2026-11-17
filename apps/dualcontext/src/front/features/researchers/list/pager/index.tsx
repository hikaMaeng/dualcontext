import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import type { Texts } from "../../../../i18n";
import { pageCount } from "../../query";
import { RSC } from "./resource";

/** 이전 / 다음과 「현재 쪽 / 전체 쪽」. 쪽이 하나뿐이어도 위치는 보인다. */
export function Pager({ page, total, pageSize, onPage, t }: { page: number; total: number; pageSize: number; onPage: (page: number) => void; t: Texts }) {
  const pages = pageCount(total, pageSize);
  return (
    <nav aria-label={t[RSC.RESEARCHERS_PAGER_LABEL]} className="flex items-center justify-between gap-3" data-testid="researcher-pager">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="researcher-pager-prev">
        <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
        {t[RSC.RESEARCHERS_PAGER_PREV_BUTTON]}
      </Button>
      <p role="status" data-testid="researcher-pager-position" className="text-sm text-muted">
        {t[RSC.RESEARCHERS_PAGER_POSITION_LABEL]}: {page} / {pages}
      </p>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} data-testid="researcher-pager-next">
        {t[RSC.RESEARCHERS_PAGER_NEXT_BUTTON]}
        <ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
      </Button>
    </nav>
  );
}
