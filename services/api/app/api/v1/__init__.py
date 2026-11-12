from fastapi import APIRouter

from app.api.v1 import capacity, config, me, ports, predict , shipments

api_router = APIRouter()
api_router.include_router(me.router)
api_router.include_router(config.router)
api_router.include_router(ports.router)
api_router.include_router(shipments.router)
api_router.include_router(capacity.router)
api_router.include_router(predict.router)
