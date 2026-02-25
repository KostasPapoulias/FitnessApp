import { IonButtons, IonButton, IonHeader, IonToolbar, IonTitle } from '@ionic/react';
import { useLocation } from 'react-router-dom';
import { useIonRouter } from '@ionic/react';

const links = [
  { label: 'Home', path: '/home' },
  { label: 'Add', path: '/add' },
  { label: 'Start', path: '/start' },
];

export default function NavBar() {
  const location = useLocation();
  const ionRouter = useIonRouter();

  return (
    <IonHeader>
      <IonToolbar>
        <IonTitle>Workout App</IonTitle>
        <IonButtons slot="end">
          {links.map((link) => (
            <IonButton
              key={link.path}
              fill={location.pathname === link.path ? 'solid' : 'clear'}
              onClick={() => ionRouter.push(link.path, 'forward')}
            >
              {link.label}
            </IonButton>
          ))}
        </IonButtons>
      </IonToolbar>
    </IonHeader>
  );
}
