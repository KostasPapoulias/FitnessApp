import { IonContent, IonPage } from '@ionic/react';
import TopPart from '../components/layout/TopPart';

export default function Start() {
  return (
    <IonPage>
      <IonContent className="page-content">
        <TopPart title="Start" subtitle="Run your active workout session" />
      </IonContent>
    </IonPage>
  );
}
