import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { Provider } from 'react-redux';
import StoreExersices from './StoreExersices.jsx';
import StoreCategories from './StoreCategories.jsx';
import store from './Store';

const root = document.getElementById('root');
createRoot(root).render(
  <Provider store={store}>
    <App />
  </Provider>
);
