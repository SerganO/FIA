"""FastAPI auth dependencies for role and permission checks."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt import decode_supabase_jwt
from app.db.supabase_client import get_supabase

_bearer = HTTPBearer(auto_error=False)

# Mirrors supabase/migrations/027_rbac_permissions.sql seeds
ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "guest": frozenset({"map.read"}),
    "user": frozenset({
        "map.read", "proposals.create", "proposals.submit", "proposals.delete.own",
        "hazards.report", "votes.cast", "comments.write",
    }),
    "city_official": frozenset({
        "map.read", "proposals.create", "proposals.submit", "proposals.review",
        "proposals.delete.own", "hazards.report", "hazards.review", "votes.cast", "comments.write",
    }),
    "admin": frozenset({
        "map.read", "proposals.create", "proposals.submit", "proposals.review",
        "proposals.delete.own", "proposals.delete.any", "hazards.report", "hazards.review",
        "votes.cast", "comments.write", "admin.ml", "admin.import", "admin.users",
    }),
}


@dataclass
class CurrentUser:
    id: str
    role: str

    def has_role(self, *roles: str) -> bool:
        return self.role in roles

    def has_permission(self, permission: str) -> bool:
        return permission in ROLE_PERMISSIONS.get(self.role, frozenset())


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> CurrentUser:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_supabase_jwt(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    supabase = get_supabase()
    result = (
        supabase.table("profiles")
        .select("role")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Profile not found")

    return CurrentUser(id=user_id, role=result.data["role"])


def require_role(*roles: str):
    async def _dep(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if not user.has_role(*roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return _dep


def require_permission(permission: str):
    async def _dep(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if not user.has_permission(permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _dep
