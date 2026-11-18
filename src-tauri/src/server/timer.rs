//! Reloj de juego: tarea en segundo plano que descuenta `time_remaining`.
//!
//! Hace tick cada 100 ms (no cada segundo) y le pasa al motor el tiempo real
//! transcurrido; el motor acumula fracciones y solo descuenta segundos enteros.
//! Así una pregunta cargada a mitad de un tick no pierde casi un segundo, y el
//! error máximo al pausar/cargar es de ~100 ms en lugar de ~1 s.

use std::time::Duration;

use tokio::time::{interval, Instant, MissedTickBehavior};

use super::{AppState, Sound};
use crate::game::{GamePhase, TickOutcome};

pub const TICK: Duration = Duration::from_millis(100);

pub async fn run(state: AppState) {
    let mut ticker = interval(TICK);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let mut last = Instant::now();

    loop {
        ticker.tick().await;
        let now = Instant::now();
        let elapsed_ms = now.duration_since(last).as_millis() as u64;
        last = now;

        // Lectura barata primero: casi siempre el reloj está parado.
        if !state.game.read().await.timer_running() {
            continue;
        }
        let mut game = state.game.write().await;
        match game.tick(elapsed_ms) {
            TickOutcome::Unchanged => {}
            // El comodín agotado sigue activo (el stage parpadea) hasta que se cierre.
            TickOutcome::SecondElapsed | TickOutcome::ComodinTimeUp => state.broadcast(&mut game, None),
            // En el rosco el tiempo agotado puede acabar en victoria si llegó al mínimo.
            TickOutcome::TimeUp => {
                let sound = if game.phase == GamePhase::Won { Sound::PlayWin } else { Sound::PlayWrong };
                state.broadcast(&mut game, Some(sound))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        game::{GameState, DEFAULT_TIME_PER_QUESTION},
        schemas::{Difficulty, GameMode, Question},
        server::ClientCommand,
    };

    fn question() -> Question {
        Question {
            id: "t".into(),
            mode: GameMode::Millonario,
            category: "c".into(),
            difficulty: Difficulty::Easy,
            question: "q".into(),
            answers: vec!["a".into(), "b".into(), "c".into(), "d".into()],
            correct: 0,
            meta: None,
        }
    }

    /// Con el tiempo de tokio pausado, el reloj avanza de forma determinista.
    #[tokio::test(start_paused = true)]
    async fn counts_down_pauses_and_times_out() {
        let app = AppState::new(GameState::new(GameMode::Millonario, 5));
        tokio::spawn(run(app.clone()));
        app.apply(ClientCommand::LoadQuestion(question())).await.unwrap();
        let mut rx = app.tx.subscribe();

        tokio::time::sleep(Duration::from_millis(3050)).await;
        assert_eq!(app.game.read().await.time_remaining, DEFAULT_TIME_PER_QUESTION - 3);
        let ticks: Vec<String> = std::iter::from_fn(|| rx.try_recv().ok()).collect();
        assert_eq!(ticks.len(), 3, "un broadcast por segundo: {ticks:?}");

        app.apply(ClientCommand::PauseTimer).await.unwrap();
        tokio::time::sleep(Duration::from_secs(10)).await;
        assert_eq!(app.game.read().await.time_remaining, DEFAULT_TIME_PER_QUESTION - 3);

        app.apply(ClientCommand::ResumeTimer).await.unwrap();
        while rx.try_recv().is_ok() {}
        tokio::time::sleep(Duration::from_secs(DEFAULT_TIME_PER_QUESTION as u64)).await;

        let game = app.game.read().await;
        assert_eq!((game.phase, game.time_remaining, game.is_correct), (GamePhase::GameOver, 0, Some(false)));
        let msgs: Vec<String> = std::iter::from_fn(|| rx.try_recv().ok()).collect();
        assert_eq!(msgs.last().unwrap(), r#"{"type":"audio","payload":{"sound":"play_wrong"}}"#);
    }
}
