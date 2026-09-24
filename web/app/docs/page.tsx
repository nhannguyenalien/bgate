const endpoints = [
  ["POST", "/api/v1/checkout", "Tạo checkout mới"],
  ["GET", "/api/v1/payments/{order_id}", "Đọc trạng thái thanh toán"],
  ["GET", "/api/v1/entitlements/{user_id}/{product}", "Kiểm tra quyền truy cập"],
  ["POST", "/api/v1/webhooks/{provider}", "Webhook cho btcpay, whop hoặc gumroad"],
];

export default function Docs() {
  return <main className="page-body"><div className="container-xl py-5">
    <div className="mb-4"><div className="page-pretitle">BGate</div><h1>Billing API</h1><p className="text-secondary">API cùng domain, chạy trực tiếp trên Cloudflare. Các endpoint ứng dụng cần gửi header <code>x-api-key</code>.</p></div>
    <div className="card mb-4"><div className="table-responsive"><table className="table card-table table-vcenter"><thead><tr><th>Method</th><th>Endpoint</th><th>Mô tả</th></tr></thead><tbody>{endpoints.map(([method, path, note]) => <tr key={path}><td><span className="badge bg-blue-lt">{method}</span></td><td><code>{path}</code></td><td>{note}</td></tr>)}</tbody></table></div></div>
    <div className="card"><div className="card-header"><h2 className="card-title">Ví dụ tạo checkout</h2></div><div className="card-body"><pre>{`curl -X POST https://billing.schoolsai.work/api/v1/checkout \\\n  -H 'content-type: application/json' \\\n  -H 'x-api-key: YOUR_API_KEY' \\\n  -d '{\n    "product": "itsupport-pro",\n    "user_id": "123",\n    "provider": "usdt",\n    "amount": 19,\n    "currency": "USDT"\n  }'`}</pre></div></div>
  </div></main>;
}
