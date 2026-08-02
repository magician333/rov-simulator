import { useAppStore } from '../state/store';
import { MainMenu } from './MainMenu';
import { TrainingScreen } from './TrainingScreen';

export function App() {
  const screen = useAppStore((s) => s.screen);
  return screen === 'menu' ? <MainMenu /> : <TrainingScreen />;
}
