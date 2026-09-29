export default function OfflinePage() {
  return (
    <main className="container section stack">
      <h1>You are offline</h1>
      <p>
        If you have already signed in and opened records on this device, you can
        save pesticide and purchase records locally. Reopen records online to
        sync. AI and new sign-ins need a connection.
      </p>
      <a className="btn" href="/records">
        Open offline records
      </a>
      <p>
        No borre los datos del navegador antes de sincronizar sus registros.
      </p>
    </main>
  );
}
