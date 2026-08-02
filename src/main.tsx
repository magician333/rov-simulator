import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
// 副作用导入：确保场景注册表执行（主菜单/训练界面读取）
import './render/scenes/registry';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
