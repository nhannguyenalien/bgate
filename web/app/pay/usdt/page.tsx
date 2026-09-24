"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

type Order = { id: string; product: string; status: string; metadata: { receive_address?: string; expected_amount?: string; expires_at?: string; transaction_id?: string } };

export default function UsdtCheckout() {
  const [order, setOrder] = useState<Order | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const refresh = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("order");
    const token = params.get("token");
    if (!id || !token) { setError("Liên kết checkout không hợp lệ."); return; }
    const response = await fetch(`/api/v1/usdt/status/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!response.ok) { setError("Không thể tải đơn thanh toán."); return; }
    const data = await response.json() as Order;
    setOrder(data);
    const address = data.metadata.receive_address || "";
    const amount = data.metadata.expected_amount || "";
    if (address && amount) setQr(await QRCode.toDataURL(`tron:${address}?amount=${amount}`, { width: 280, margin: 1 }));
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 12_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1500);
  }

  const meta = order?.metadata;
  const paid = order?.status === "paid";
  return <main className="page-body"><div className="container-tight py-6">
    <div className="text-center mb-4"><div className="page-pretitle">SchoolsAI · BGate</div><h1>Thanh toán USDT</h1><p className="text-secondary">Mạng TRON (TRC20)</p></div>
    <div className="card"><div className="card-body text-center p-4 p-md-5">
      {error && <div className="alert alert-danger">{error}</div>}
      {!order && !error && <span className="spinner-border text-primary" />}
      {order && paid && <div className="py-5"><div className="display-5 text-success mb-3">✓</div><h2>Đã nhận thanh toán</h2><p className="text-secondary">Quyền sử dụng đã được kích hoạt.</p>{meta?.transaction_id && <a className="btn btn-outline-primary" href={`https://tronscan.org/#/transaction/${meta.transaction_id}`} target="_blank" rel="noreferrer">Xem giao dịch</a>}</div>}
      {order && !paid && <>
        <span className={`badge mb-3 ${order.status === "expired" ? "bg-secondary-lt" : "bg-yellow-lt text-yellow"}`}>{order.status}</span>
        {order.status === "expired" ? <div className="alert alert-warning">Checkout đã hết hạn. Hãy tạo đơn mới.</div> : <>
          {qr && <img src={qr} width={280} height={280} alt="QR thanh toán USDT TRC20" className="img-fluid rounded mb-3" />}
          <h2 className="mb-1">{meta?.expected_amount} USDT</h2>
          <p className="text-secondary">Gửi đúng số tiền trên qua mạng TRON (TRC20).</p>
          <div className="input-group mb-3"><input className="form-control font-monospace" readOnly value={meta?.receive_address || ""} /><button className="btn btn-outline-primary" onClick={() => copy(meta?.receive_address || "", "address")}>{copied === "address" ? "Đã chép" : "Chép ví"}</button></div>
          <button className="btn btn-primary w-100 mb-3" onClick={() => copy(meta?.expected_amount || "", "amount")}>{copied === "amount" ? "Đã chép số tiền" : "Chép số tiền"}</button>
          <div className="alert alert-warning text-start mb-0"><strong>Chỉ gửi USDT-TRC20.</strong> Gửi sai mạng hoặc sai số tiền có thể không được xác nhận tự động.</div>
        </>}
      </>}
    </div></div>
    <p className="text-center text-secondary small mt-3">Trang tự kiểm tra giao dịch mỗi 12 giây. Không cần tải lại.</p>
  </div></main>;
}
