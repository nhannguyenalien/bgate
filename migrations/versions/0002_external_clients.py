"""external API clients, idempotency and outbound webhooks"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "api_clients",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("mode", sa.String(10), nullable=False),
        sa.Column("key_prefix", sa.String(32), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("webhook_url", sa.String(2000)),
        sa.Column("webhook_secret", sa.String(200)),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("mode IN ('test', 'live')"),
    )
    op.add_column("orders", sa.Column("client_id", sa.Uuid(), sa.ForeignKey("api_clients.id")))
    op.add_column("orders", sa.Column("mode", sa.String(10), nullable=False, server_default="live"))
    op.add_column("orders", sa.Column("idempotency_key", sa.String(200)))
    op.add_column("orders", sa.Column("request_hash", sa.String(64)))
    op.create_index("ix_orders_client_id", "orders", ["client_id"])
    op.create_unique_constraint("uq_orders_client_idempotency", "orders", ["client_id", "mode", "idempotency_key"])
    op.create_table(
        "api_rate_limits",
        sa.Column("client_id", sa.Uuid(), sa.ForeignKey("api_clients.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("bucket", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("request_count", sa.Integer(), nullable=False),
    )
    op.create_table(
        "webhook_deliveries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("client_id", sa.Uuid(), sa.ForeignKey("api_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Uuid(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(120), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("response_status", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("order_id", "event_type"),
    )


def downgrade():
    op.drop_table("webhook_deliveries")
    op.drop_table("api_rate_limits")
    op.drop_constraint("uq_orders_client_idempotency", "orders", type_="unique")
    op.drop_index("ix_orders_client_id", table_name="orders")
    op.drop_column("orders", "request_hash")
    op.drop_column("orders", "idempotency_key")
    op.drop_column("orders", "mode")
    op.drop_column("orders", "client_id")
    op.drop_table("api_clients")
