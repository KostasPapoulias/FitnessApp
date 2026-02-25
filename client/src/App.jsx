import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';

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
import './styles/iosLayout.css';

setupIonicReact();

export default function App() {
  return (
    <IonApp>
      <IonReactRouter>
        <div className="app-shell">
          <NavBar />
          <IonRouterOutlet id="main-content">
            <Route exact path="/home" component={Home} />
            <Route exact path="/add" component={Add} />
            <Route exact path="/start" component={Start} />
            <Route exact path="/">
              <Redirect to="/home" />
            </Route>
          </IonRouterOutlet>
        </div>
      </IonReactRouter>
    </IonApp>
  );
}
