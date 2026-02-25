import { IonContent, IonPage } from '@ionic/react';
import TopPart from '../components/layout/TopPart';

export default function Add() {
  return (
    <IonPage>
      <IonContent className="page-content">
        <TopPart title="Add" subtitle="Create workout templates and exercises" />
      </IonContent>
    </IonPage>
  );
}
