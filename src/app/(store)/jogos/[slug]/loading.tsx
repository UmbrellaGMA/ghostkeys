export default function Loading() {
  return (
    <div className="container-page py-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="skeleton aspect-[460/215] rounded-3xl" />
          <div className="skeleton h-10 w-2/3" />
          <div className="skeleton h-40" />
        </div>
        <div className="skeleton h-[460px] rounded-2xl" />
      </div>
    </div>
  );
}
