export default function Home() {
  return (
    <main className="viewerHost">
      <iframe
        title="LAS Point Cloud Viewer"
        src="/viewer/index.html"
        className="viewerFrame"
        allow="fullscreen"
      />
    </main>
  );
}

