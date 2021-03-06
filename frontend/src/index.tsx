// import GlobalStyles from './styles/GlobalStyles'
import React from "react";
import ReactDOM from "react-dom";
import { App } from "./App";
import './theme.ts';


import { createRoot } from 'react-dom/client';
const container = document.getElementById('app');
const root = createRoot(container!); // createRoot(container!) if you use TypeScript
root.render(<App />);