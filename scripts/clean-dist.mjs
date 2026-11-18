// Borra dist/ antes de compilar: las tres apps escriben en subcarpetas de
// dist/app (control en la raíz, editor/ y stage/ dentro), así que ninguna
// puede vaciar la carpeta por su cuenta sin borrar a las otras.
import { rmSync } from "node:fs";
rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
console.log("dist/ limpio");
