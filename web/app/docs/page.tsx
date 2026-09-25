const endpoints = [
  ["POST", "/api/v1/checkout", "Tạo checkout mới"],
  ["GET", "/api/v1/payments/{order_id}", "Đọc trạng thái thanh toán"],
  ["GET", "/api/v1/entitlements/{user_id}/{product}", "Kiểm tra quyền truy cập"],
  ["POST", "/api/v1/webhooks/{provider}", "Webhook cho btcpay, whop hoặc gumroad"],
  ["POST", "/api/v1/test/pay/{order_id}", "Mô phỏng kết quả bằng test key"],
];

export default function Docs() {
  return <main className="page-body"><div className="container-xl py-5">
    <div className="mb-4"><div className="page-pretitle">BGate</div><h1>Billing API</h1><p className="text-secondary">Mỗi ứng dụng dùng API key riêng. Key test và live được cô lập hoàn toàn.</p></div>
    <div className="card mb-4"><div className="table-responsive"><table className="table card-table table-vcenter"><thead><tr><th>Method</th><th>Endpoint</th><th>Mô tả</th></tr></thead><tbody>{endpoints.map(([method, path, note]) => <tr key={path}><td><span className="badge bg-blue-lt">{method}</span></td><td><code>{path}</code></td><td>{note}</td></tr>)}</tbody></table></div></div>
    <div className="card"><div className="card-header"><h2 className="card-title">Ví dụ tạo checkout</h2></div><div className="card-body"><pre>{`curl -X POST https://billing.schoolsai.work/api/v1/checkout \\\n+  -H 'content-type: application/json' \\\n+  -H 'x-api-key: bg_test_YOUR_API_KEY' \\\n+  -H 'idempotency-key: checkout-user123-001' \\\n+  -d '{
    "product": "itsupport-pro",
    "user_id": "123",
    "provider": "usdt",
    "amount": 19,
    "currency": "USDT"
  }'`}</pre><p className="text-secondary mt-3">Luôn dùng một <code>Idempotency-Key</code> duy nhất cho mỗi lần mua.</p></div></div>
    <div className="card mt-4"><div className="card-header"><h2 className="card-title">Xác minh webhook gửi về ứng dụng</h2></div><div className="card-body"><p>Chữ ký <code>x-bgate-signature</code> là HMAC-SHA256 của <code>timestamp.raw_body</code>.</p><p className="mb-0">Kiểm tra <code>x-bgate-timestamp</code> trong 5 phút và lưu <code>x-bgate-event-id</code> để chống replay.</p></div></div>
  </div></main>;
}
