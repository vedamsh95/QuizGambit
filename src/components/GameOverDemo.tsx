import GameOver from "./GameOver";

export default function GameOverDemo() {
  return (
    <GameOver
      lobbyCode="DEMO"
      players={[]}
      demo={true}
      onPlayAgain={() => alert("Play Again clicked")}
      onLeave={() => alert("Exit clicked")}
    />
  );
}
