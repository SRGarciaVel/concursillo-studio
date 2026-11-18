# Efectos de sonido

El stage reproduce estos archivos cuando el backend emite un evento de audio.
Se sirven desde `http://127.0.0.1:4322/sounds/<nombre>`.

| Evento          | Cuándo                                   |
|-----------------|------------------------------------------|
| `play_tension`  | Se carga una pregunta (suena en bucle)   |
| `play_correct`  | Respuesta correcta                       |
| `play_wrong`    | Respuesta incorrecta o se acaba el tiempo|
| `play_win`      | Última pregunta acertada / rosco ganado  |
| `play_pass`     | Pasapalabra (rosco)                      |
| `play_drumroll` | Soundboard del Control: redoble          |
| `play_applause` | Soundboard del Control: aplausos         |

Para cada evento se busca primero `<evento>.mp3` y, si no existe, `<evento>.wav`.
Los `.wav` incluidos son tonos sintetizados de prueba: pon tus propios `.mp3`
con el mismo nombre y tendrán prioridad sin tocar código.
