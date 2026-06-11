import asyncio
import sys

from app.services.health import check_readiness


async def main() -> int:
    result = await check_readiness()
    return 0 if result.ready else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

