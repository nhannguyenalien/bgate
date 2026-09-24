"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  IconActivityHeartbeat, IconBook2, IconCheck, IconChevronRight, IconCreditCard,
  IconDashboard, IconKey, IconLogout, IconRefresh, IconSearch, IconWebhook,
} from "@tabler/icons-react";
import Login from "./login";
import type { DashboardData, Entitlement, Order, Section, Webhook } from "./types";

const fmtDate = (value: string) => new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
}).format(new Date(value));
const fmtMoney = (amount: string, currency: string) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency, maximumFractionDigits: 8,
}).format(Number(amount));

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (response.status === 401) throw new Error("UNAUTHORIZED");
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json() as Promise<T>;
}

function Status({ value }: { value: string }) {
  const color: Record<string, string> = { paid: "green", pending: "yellow", processing: "azure", active: "green", inactive: "secondary", failed: "red", expired: "secondary", refunded: "purple", cancelled: "red" };
  return <span className={`badge bg-${color[value] || "blue"}-lt text-${color[value] || "blue"}`}>{value}</span>;
}

export default function Dashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>("orders");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Webhook[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ q: "", provider: "", payment_status: "" });

  const load = useCallback(async (target: Section = section, params = filters) => {
    setLoading(true); setError("");
    try {
      if (target === "orders") {
        const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
        setDashboard(await api<DashboardData>(`/api/admin/dashboard?${query}`));
      } else if (target === "entitlements") {
        setEntitlements((await api<{ items: Entitlement[] }>("/api/admin/entitlements")).items);
      } else {
        setWebhooks((await api<{ events: Webhook[] }>("/api/admin/webhooks")).events);
      }
      setAuthenticated(true);
    } catch (exception) {
      if ((exception as Error).message === "UNAUTHORIZED") setAuthenticated(false);
      else setError("Không thể tải dữ liệu. Vui lòng thử lại.");
    } finally { setLoading(false); }
  }, [filters, section]);

  useEffect(() => { load("orders"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (authenticated === false) return <Login onSuccess={() => { setAuthenticated(true); load("orders"); }} />;
  if (authenticated === null && loading) return <div className="page-loader"><span className="spinner-border text-primary" /></div>;

  async function changeSection(next: Section) { setSection(next); setSelected(null); await load(next); }
  async function openOrder(order: Order) {
    setSelected(order);
    const detail = await api<{ order: Order; events: Webhook[] }>(`/api/admin/orders/${order.id}`);
    setSelected(detail.order); setSelectedEvents(detail.events);
  }
  async function logout() { await fetch("/api/session", { method: "DELETE" }); setAuthenticated(false); }
  function submitFilters(event: FormEvent) { event.preventDefault(); load("orders", filters); }

  const stats = dashboard?.stats;
  return (
    <div className="page">
      <aside className="navbar navbar-vertical navbar-expand-lg bg-navy" data-bs-theme="dark">
        <div className="container-fluid">
          <div className="navbar-brand navbar-brand-autodark"><span className="brand-symbol"><IconCreditCard size={24} /></span> BGate</div>
          <div className="navbar-nav flex-column">
            <button className={`nav-link ${section === "orders" ? "active" : ""}`} onClick={() => changeSection("orders")}><IconDashboard /> <span>Đơn hàng</span></button>
            <button className={`nav-link ${section === "entitlements" ? "active" : ""}`} onClick={() => changeSection("entitlements")}><IconKey /> <span>Quyền truy cập</span></button>
            <button className={`nav-link ${section === "webhooks" ? "active" : ""}`} onClick={() => changeSection("webhooks")}><IconWebhook /> <span>Webhooks</span></button>
            <a className="nav-link" href="https://apibill.schoolsai.work/docs" target="_blank" rel="noreferrer"><IconBook2 /> <span>API Docs</span></a>
          </div>
          <button className="nav-link logout-link" onClick={logout}><IconLogout /> <span>Đăng xuất</span></button>
        </div>
      </aside>
      <div className="page-wrapper">
        <header className="navbar navbar-expand-md d-print-none topbar"><div className="container-xl">
          <div><div className="page-pretitle">SchoolsAI · Billing Router</div><h1 className="page-title">{section === "orders" ? "Đơn hàng" : section === "entitlements" ? "Quyền truy cập" : "Webhook events"}</h1></div>
          <div className="ms-auto d-flex align-items-center gap-3"><span className="system-online"><i /> Hệ thống hoạt động</span><button className="btn btn-outline-primary btn-icon" onClick={() => load()} title="Làm mới"><IconRefresh className={loading ? "spin" : ""} size={19} /></button></div>
        </div></header>
        <main className="page-body"><div className="container-xl">
          {error && <div className="alert alert-danger">{error}</div>}
          {section === "orders" && <>
            <div className="row row-deck row-cards mb-4">
              {[
                ["Tổng đơn", stats?.total_orders || 0, "Tất cả nhà cung cấp", <IconCreditCard key="a" />],
                ["Đã thanh toán", stats?.paid || 0, "Hoàn tất thanh toán", <IconCheck key="b" />],
                ["Đang xử lý", stats?.pending || 0, "Pending + processing", <IconActivityHeartbeat key="c" />],
                ["Quyền đang mở", stats?.active_entitlements || 0, `${stats?.webhook_count || 0} webhook đã nhận`, <IconKey key="d" />],
              ].map(([label, value, note, icon]) => <div className="col-sm-6 col-lg-3" key={String(label)}><div className="card stat-card"><div className="card-body"><div className="stat-icon">{icon}</div><div className="text-secondary text-uppercase small fw-semibold">{label}</div><div className="display-6 fw-bold my-1">{value}</div><div className="text-secondary small">{note}</div></div></div></div>)}
            </div>
            <div className="card">
              <div className="card-header filter-header"><form className="row g-2 w-100" onSubmit={submitFilters}>
                <div className="col-lg"><div className="input-icon"><span className="input-icon-addon"><IconSearch size={18} /></span><input className="form-control" placeholder="Tìm user hoặc sản phẩm…" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} /></div></div>
                <div className="col-lg-auto"><select className="form-select" value={filters.provider} onChange={e => setFilters({ ...filters, provider: e.target.value })}><option value="">Mọi provider</option><option value="btcpay">BTCPay</option><option value="whop">Whop</option><option value="gumroad">Gumroad</option></select></div>
                <div className="col-lg-auto"><select className="form-select" value={filters.payment_status} onChange={e => setFilters({ ...filters, payment_status: e.target.value })}><option value="">Mọi trạng thái</option>{["pending", "processing", "paid", "expired", "cancelled", "failed", "refunded"].map(x => <option key={x}>{x}</option>)}</select></div>
                <div className="col-lg-auto"><button className="btn btn-primary">Lọc</button></div>
              </form></div>
              <div className="table-responsive"><table className="table table-vcenter card-table table-hover"><thead><tr><th>Đơn hàng</th><th>Khách hàng</th><th>Provider</th><th>Số tiền</th><th>Trạng thái</th><th>Thời gian</th><th /></tr></thead><tbody>
                {dashboard?.orders.map(order => <tr key={order.id} role="button" onClick={() => openOrder(order)}><td><strong>{order.product}</strong><div className="text-secondary font-monospace small">{order.id.slice(0, 12)}…</div></td><td>{order.user_id}</td><td><span className="badge bg-indigo-lt text-indigo">{order.provider}</span></td><td className="fw-semibold">{fmtMoney(order.amount, order.currency)}</td><td><Status value={order.status} /></td><td className="text-secondary">{fmtDate(order.created_at)}</td><td><IconChevronRight size={18} /></td></tr>)}
                {!dashboard?.orders.length && <tr><td colSpan={7} className="text-center text-secondary py-5">Chưa có đơn hàng phù hợp.</td></tr>}
              </tbody></table></div>
            </div>
          </>}
          {section === "entitlements" && <DataCard><table className="table table-vcenter card-table"><thead><tr><th>Người dùng</th><th>Sản phẩm</th><th>Trạng thái</th><th>Order ID</th><th>Cập nhật</th></tr></thead><tbody>{entitlements.map(item => <tr key={item.id}><td className="fw-semibold">{item.user_id}</td><td>{item.product}</td><td><Status value={item.active ? "active" : "inactive"} /></td><td className="font-monospace small">{item.order_id ? `${item.order_id.slice(0, 12)}…` : "—"}</td><td className="text-secondary">{fmtDate(item.updated_at)}</td></tr>)}</tbody></table></DataCard>}
          {section === "webhooks" && <DataCard><table className="table table-vcenter card-table"><thead><tr><th>Event</th><th>Provider</th><th>Delivery ID</th><th>Order</th><th>Nhận lúc</th></tr></thead><tbody>{webhooks.map(event => <tr key={event.id}><td className="fw-semibold">{event.event_type}</td><td><span className="badge bg-indigo-lt text-indigo">{event.provider}</span></td><td className="font-monospace small">{event.delivery_id}</td><td className="font-monospace small">{event.order_id ? `${event.order_id.slice(0, 12)}…` : "—"}</td><td className="text-secondary">{fmtDate(event.received_at)}</td></tr>)}</tbody></table></DataCard>}
        </div></main>
      </div>
      {selected && <div className="detail-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}><aside className="detail-drawer"><div className="drawer-head"><div><div className="page-pretitle">Chi tiết đơn hàng</div><h2>{selected.product}</h2></div><button className="btn-close" onClick={() => setSelected(null)} /></div><div className="drawer-body"><Status value={selected.status} /><dl className="detail-list"><dt>Order ID</dt><dd className="font-monospace">{selected.id}</dd><dt>Khách hàng</dt><dd>{selected.user_id}</dd><dt>Provider</dt><dd>{selected.provider}</dd><dt>Provider ID</dt><dd className="font-monospace">{selected.provider_payment_id || "—"}</dd><dt>Số tiền</dt><dd>{fmtMoney(selected.amount, selected.currency)}</dd><dt>Tạo lúc</dt><dd>{fmtDate(selected.created_at)}</dd></dl>{selected.checkout_url && <a className="btn btn-primary w-100" href={selected.checkout_url} target="_blank" rel="noreferrer">Mở checkout</a>}<h3 className="mt-4">Metadata</h3><pre>{JSON.stringify(selected.metadata, null, 2)}</pre><h3 className="mt-4">Webhook ({selectedEvents.length})</h3>{selectedEvents.map(event => <div className="event-row" key={event.id}><strong>{event.event_type}</strong><small>{fmtDate(event.received_at)}</small></div>)}</div></aside></div>}
    </div>
  );
}

function DataCard({ children }: { children: React.ReactNode }) { return <div className="card"><div className="table-responsive">{children}</div></div>; }
