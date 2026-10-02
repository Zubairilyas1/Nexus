"""Plugin API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, Optional

from app.plugins.registry import plugin_registry
from app.plugins.manager import plugin_manager
from app.plugins.base import AnalyticsPlugin, PluginMetadata

router = APIRouter()


class PluginInstall(BaseModel):
    name: str
    config: Dict[str, Any] = {}


class PluginConfigUpdate(BaseModel):
    config: Dict[str, Any]


@router.get("")
async def list_plugins():
    """List all available plugins."""
    available = plugin_registry.list_plugins()
    installed = plugin_manager.list_installed()

    installed_map = {p["name"]: p for p in installed}

    result = []
    for plugin in available:
        entry = {**plugin}
        if plugin["name"] in installed_map:
            entry["installed"] = True
            entry.update(installed_map[plugin["name"]])
        else:
            entry["installed"] = False
        result.append(entry)

    # Add installed plugins not in registry (external)
    for name, info in installed_map.items():
        if not any(p["name"] == name for p in available):
            result.append({**info, "installed": True})

    return {"plugins": result}


@router.post("/install")
async def install_plugin(data: PluginInstall):
    """Install a plugin by name."""
    plugin_class = plugin_registry.get_plugin(data.name)
    if not plugin_class:
        raise HTTPException(status_code=404, detail=f"Plugin '{data.name}' not found in registry")

    try:
        instance = plugin_class()
        name = plugin_manager.install_plugin(instance, data.config)
        return {"status": "installed", "name": name}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Installation failed: {str(e)}")


@router.post("/{name}/enable")
async def enable_plugin(name: str):
    """Enable an installed plugin."""
    try:
        plugin_manager.enable_plugin(name)
        return {"status": "enabled", "name": name}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{name}/disable")
async def disable_plugin(name: str):
    """Disable an installed plugin."""
    try:
        plugin_manager.disable_plugin(name)
        return {"status": "disabled", "name": name}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{name}")
async def uninstall_plugin(name: str):
    """Uninstall a plugin."""
    try:
        plugin_manager.uninstall_plugin(name)
        return {"status": "uninstalled", "name": name}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{name}/results")
async def get_plugin_results(name: str, limit: int = 100):
    """Get results from a plugin."""
    results = plugin_manager.get_plugin_results(name, limit)
    return {
        "name": name,
        "results": [
            {
                "plugin_name": r.plugin_name,
                "timestamp": r.timestamp,
                "data": r.data,
                "metrics": r.metrics,
                "error": r.error,
            }
            for r in results
        ],
    }


@router.get("/{name}/config")
async def get_plugin_config(name: str):
    """Get plugin configuration schema."""
    metadata = plugin_registry.get_metadata(name)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Plugin '{name}' not found")
    return {
        "name": name,
        "config_schema": metadata.config_schema,
    }
