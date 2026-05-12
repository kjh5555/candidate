import Link from "next/link";

interface EmptyStateProps {
  message: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function EmptyState({ message, description, ctaLabel, ctaHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <svg
          className="w-7 h-7 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <p className="text-slate-700 font-medium mb-1">{message}</p>
      {description && (
        <p className="text-slate-400 text-sm max-w-xs">{description}</p>
      )}
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
