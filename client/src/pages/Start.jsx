import { IonContent, IonPage } from '@ionic/react';
import TopPart from '../components/layout/TopPart';

export default function Start() {
  return (
    <IonPage>
      <IonContent fullscreen>
        <TopPart title="Start" subtitle="Run your active workout session" />
      </IonContent>
    </IonPage>
  );
}
