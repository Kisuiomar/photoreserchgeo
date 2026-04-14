import os


class Settings:
    def __init__(self) -> None:
        self.geoclip_top_k: int = int(os.getenv("GEOCLIP_TOP_K", "5"))
        self.port: int = int(os.getenv("PORT", "9017"))
        self.photos_dir: str = "/photos"
        self.edit_mode_enabled: bool = os.getenv(
            "EDIT_MODE_ENABLED", "true"
        ).lower() in ("true", "1", "yes")
        self.model_idle_timeout: int = int(os.getenv("MODEL_IDLE_TIMEOUT", "600"))


settings = Settings()
