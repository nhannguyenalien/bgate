from app.admin import SESSION_MAX_AGE, _session_token, _valid_session


def test_admin_session_round_trip() -> None:
    token = _session_token("admin", "a-long-secret", issued_at=1_000)

    assert _valid_session(token, "admin", "a-long-secret", now=1_001)


def test_admin_session_rejects_tampering_and_expiry() -> None:
    token = _session_token("admin", "a-long-secret", issued_at=1_000)

    assert not _valid_session(token + "x", "admin", "a-long-secret", now=1_001)
    assert not _valid_session(token, "admin", "wrong-secret", now=1_001)
    assert not _valid_session(token, "admin", "a-long-secret", now=1_000 + SESSION_MAX_AGE + 1)
