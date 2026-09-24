"use client";

import { FormEvent, useState } from "react";
import { IconArrowRight, IconLock, IconShieldLock } from "@tabler/icons-react";

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    setLoading(false);
    if (!response.ok) {
      setError("Tên đăng nhập hoặc mật khẩu không đúng.");
      return;
    }
    onSuccess();
  }

  return (
    <main className="login-shell">
      <div className="login-brand">
        <span className="brand-symbol"><IconShieldLock size={30} /></span>
        <div><strong>BGate</strong><small>SchoolsAI Billing Router</small></div>
      </div>
      <div className="card card-md login-card">
        <div className="card-body">
          <div className="login-icon"><IconLock size={26} /></div>
          <h1 className="h2 text-center mb-2">Đăng nhập quản trị</h1>
          <p className="text-secondary text-center mb-4">Theo dõi đơn hàng, quyền truy cập và webhook.</p>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <form onSubmit={submit}>
            <div className="mb-3">
              <label className="form-label">Tên đăng nhập</label>
              <input className="form-control" name="username" autoComplete="username" required autoFocus />
            </div>
            <div className="mb-4">
              <label className="form-label">Mật khẩu</label>
              <input className="form-control" type="password" name="password" autoComplete="current-password" required />
            </div>
            <button className="btn btn-primary w-100" disabled={loading}>
              {loading ? <span className="spinner-border spinner-border-sm" /> : <>Đăng nhập <IconArrowRight size={18} /></>}
            </button>
          </form>
        </div>
      </div>
      <p className="text-secondary small">Protected by Cloudflare Pages Functions</p>
    </main>
  );
}
