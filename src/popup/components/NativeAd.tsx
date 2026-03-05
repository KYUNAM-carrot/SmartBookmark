// 네이티브 광고 렌더링 컴포넌트
import React, { useEffect, useRef, useState } from 'react';
import type { NativeAdData } from '@/types';
import { adEngine } from '@/lib/ad-engine';

interface NativeAdProps {
  ad: NativeAdData | null | undefined;
  onDismiss?: () => void;
  className?: string;
}

// 광고 타입별 배지 텍스트
const TYPE_LABELS: Record<NativeAdData['type'], string> = {
  recommendation: '추천',
  sponsored: '광고',
  affiliate: '파트너',
};

/**
 * 네이티브 광고 카드 컴포넌트
 * - 인상 추적 (IntersectionObserver)
 * - 클릭 추적
 * - 닫기 버튼
 */
export function NativeAd({ ad, onDismiss, className = '' }: NativeAdProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const impressionTracked = useRef(false);

  // IntersectionObserver로 실제 화면 노출 시 impressions 추적
  useEffect(() => {
    if (!ad || impressionTracked.current) return;

    const element = cardRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          adEngine.trackImpression(ad.id).catch(() => {
            // 추적 실패는 무시
          });
          observer.disconnect();
        }
      },
      {
        threshold: 0.5, // 50% 이상 보일 때 노출로 간주
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ad]);

  // ad가 변경되면 추적 상태 초기화
  useEffect(() => {
    impressionTracked.current = false;
    setIsDismissed(false);
  }, [ad?.id]);

  // 광고가 없거나 닫힌 경우 렌더링 안 함
  if (!ad || isDismissed) return null;

  const handleClick = () => {
    adEngine.trackClick(ad.id).catch(() => {
      // 추적 실패는 무시
    });
    chrome.tabs.create({ url: ad.url });
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissed(true);
    onDismiss?.();
  };

  const typeLabel = TYPE_LABELS[ad.type] ?? '광고';

  return (
    <div
      ref={cardRef}
      className={`relative rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm ${className}`}
      role="complementary"
      aria-label="광고"
    >
      {/* 상단: 광고 레이블 + 닫기 버튼 */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
            {typeLabel}
          </span>
          <span className="text-[11px] text-gray-400">{ad.advertiser}</span>
        </div>

        {/* 닫기 버튼 */}
        <button
          onClick={handleDismiss}
          className="flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
          aria-label="광고 닫기"
          title="광고 닫기"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3 w-3"
          >
            <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
          </svg>
        </button>
      </div>

      {/* 광고 본문 */}
      <div className="flex gap-2.5">
        {/* 이미지 (있을 경우만 표시) */}
        {ad.imageUrl && (
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-gray-200">
            <img
              src={ad.imageUrl}
              alt={ad.title}
              className="h-full w-full object-cover"
              onError={(e) => {
                // 이미지 로드 실패 시 숨김
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* 텍스트 영역 */}
        <div className="min-w-0 flex-1">
          <h3 className="mb-0.5 truncate font-medium text-gray-800" title={ad.title}>
            {ad.title}
          </h3>
          <p className="line-clamp-2 text-[11px] leading-relaxed text-gray-500">
            {ad.description}
          </p>
        </div>
      </div>

      {/* CTA 버튼 */}
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">{ad.disclosure}</span>
        <button
          onClick={handleClick}
          className="rounded-md bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-100 active:bg-blue-200"
          aria-label={`${ad.cta} - ${ad.title}`}
        >
          {ad.cta}
        </button>
      </div>
    </div>
  );
}

export default NativeAd;
