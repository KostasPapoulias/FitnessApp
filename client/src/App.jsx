import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Navigate, Route } from 'react-router-dom';

import NavBar from './components/layout/NavBar';
import Home from './pages/Home';
import Add from './pages/Add';
import Start from './pages/Start';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

setupIonicReact();

export default function App() {
  return (
    <IonApp>
      <IonReactRouter>
        <NavBar />
        <IonRouterOutlet id="main-content">
          <Route path="/home" element={<Home />} />
          <Route path="/add" element={<Add />} />
          <Route path="/start" element={<Start />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}
