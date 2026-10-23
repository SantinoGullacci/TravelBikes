import { redirect } from 'next/navigation';

export default function Home() {
  // Podés cambiar '/login' por '/kiosk' o '/dashboard/rentals' según a dónde quieras que entren por defecto
  redirect('/login');
}