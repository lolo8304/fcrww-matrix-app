interface ImportMetaEnv {
    readonly STAGE: 'local' | 'preview' | 'prod';
    readonly VITE_MATRIX_SPACE_INCLUDE?: string;
    readonly VITE_MATRIX_SPACE_EXCLUDE?: string;
    readonly VITE_MATRIX_BASE_URL?: string;
    readonly VITE_MATRIX_DISCOVERY_ORIGIN?: string;
    readonly VITE_MATRIX_SERVER_NAME?: string;
}
