from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True)
class StorageConfigStatus:
    configured: bool
    endpoint: str
    bucket: str
    region: str


def get_storage_config_status() -> StorageConfigStatus:
    configured = bool(settings.idrive_e2_access_key and settings.idrive_e2_secret_key)
    return StorageConfigStatus(
        configured=configured,
        endpoint=settings.idrive_e2_endpoint,
        bucket=settings.idrive_e2_bucket,
        region=settings.idrive_e2_region,
    )

