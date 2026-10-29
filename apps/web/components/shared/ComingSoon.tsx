export function ComingSoon({
  title,
  feature,
}: {
  title: string;
  feature: string;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-3 py-16 text-center">
      <h1 className="text-2xl font-semibold text-harbor-navy">{title}</h1>
      <p className="text-sm text-muted">Coming in {feature}</p>
    </div>
  );
}
