export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-20" aria-busy="true" aria-label="טוען">
      <div className="skeleton h-48 w-full rounded-[28px]" />
      <div className="skeleton relative mx-4 -mt-7 h-14 rounded-2xl" />
      <div className="mt-5 flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-10 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-40" />
        ))}
      </div>
    </main>
  );
}
