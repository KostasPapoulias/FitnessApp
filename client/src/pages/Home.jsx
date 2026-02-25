import { IonContent, IonPage } from '@ionic/react';
import TopPart from '../components/layout/TopPart';
import Human from '../components/ui/Human';

export default function Home() {
  return (
    <IonPage>
      <IonContent className="page-content">
        <TopPart title="Home" subtitle="Overview of your workout progress" />
        <Human label="Muscle groups and body UI placeholder" />
      </IonContent>
    </IonPage>
  );
}
