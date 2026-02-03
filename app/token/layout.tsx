export default function TokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link
        rel="preload"
        href="https://static.jup.ag/tv/charting_library/charting_library.js"
        as="script"
      />
      {children}
    </>
  );
}
