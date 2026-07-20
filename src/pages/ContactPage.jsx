import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import '../index.css'; // Assure-toi que ce fichier est correct et accessible
import Navbar from '../components/Navbar';

const ContactPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });

  const [error, setError] = useState(''); // Pour afficher les erreurs
  const [success, setSuccess] = useState(''); // Pour afficher la confirmation de succès
  const [isSubmitting, setIsSubmitting] = useState(false); // Pour gérer l'état du bouton envoyer

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  // Vérification si tous les champs sont remplis et si l'email est valide
  useEffect(() => {
    // Réinitialise les messages d'erreur si tous les champs sont remplis
    if (formData.name && formData.email && formData.message) {
      setError(''); // Efface le message d'erreur si tout est rempli
    }

    // Réinitialise le message de succès seulement si tout est validé
    if (formData.name && formData.email && formData.message) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9]{2,}$/;
      if (emailRegex.test(formData.email)) {
        setSuccess('Le formulaire a bien été rempli. Vous pouvez maintenant envoyer.');
      } else {
        setSuccess('');
      }
    } else {
      setSuccess('');
    }
  }, [formData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(''); // Réinitialise le message d'erreur
    setSuccess(''); // Réinitialise le message de succès

    // Validation des champs
    if (!formData.name || !formData.email || !formData.message) {
      setError('Tous les champs doivent être remplis.');
      return; // Ne pas envoyer si un champ est vide
    }

    // Vérification du format de l'email (simple)
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9]{2,}$/;
    if (!emailRegex.test(formData.email)) {
      setError('L\'adresse e-mail est invalide.');
      return; // Ne pas envoyer si l'email est invalide
    }

    // Désactive le bouton pendant l'envoi
    setIsSubmitting(true);

    // Envoi du formulaire via fetch
    fetch('https://formspree.io/f/mwpllanl', {
      method: 'POST',
      body: JSON.stringify(formData),
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((response) => {
        if (response.ok) {
          setSuccess('Message envoyé avec succès!');
          
          // Réinitialiser les champs après un délai de 2 secondes
          setTimeout(() => {
            setFormData({
              name: '',
              email: '',
              message: '',
            });
            setIsSubmitting(false); // Réactive le bouton après 2 secondes
          }, 2500); // Délai de 2 secondes avant de réinitialiser les champs
        } else {
          setError('Erreur lors de l\'envoi du message.');
          setIsSubmitting(false); // Réactive le bouton en cas d'erreur
        }
      })
      .catch(() => {
        setError('Erreur de connexion au serveur.');
        setIsSubmitting(false); // Réactive le bouton en cas d'erreur de connexion
      });
  };

  return (
    <div className="contact-container min-h-screen bg-light-background dark:bg-dark-background text-light-text dark:text-dark-text">
      <Navbar />
      <div className="max-w-screen-xl mx-auto p-8 pt-16">
        <motion.h1
          className="text-3xl font-semibold text-center mb-6 uppercase tracking-wide pt-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          Contactez-moi
        </motion.h1>

        {/* Affichage du message d'erreur si des champs sont manquants ou incorrects */}
        {error && (
          <motion.div
            className="text-red-600 text-center mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {error}
          </motion.div>
        )}

        {/* Affichage du message de succès si le formulaire est valide */}
        {success && (
          <motion.div
            className="text-green-600 text-center mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {success}
          </motion.div>
        )}

        {/* Formulaire */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="w-full md:w-2/3 lg:w-1/2 mx-auto bg-gray-700 dark:bg-gray-800 p-6 rounded-md shadow-sm"
        >
          <form className="space-y-6" onSubmit={handleSubmit}>
            <motion.input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Nom"
              className="w-full p-3 rounded-md bg-gray-100 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            />
            <motion.input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Email"
              className="w-full p-3 rounded-md bg-gray-100 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            />
            <motion.textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              placeholder="Écrivez-moi un message ..."
              className="w-full p-3 rounded-md bg-gray-100 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
              rows="5"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            />
            <div className="flex justify-center">
              <motion.button
                type="submit"
                className="text-white p-3 px-6 rounded-md bg-blue-700 hover:bg-blue-500 transition-all"
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.3 }}
                disabled={isSubmitting} // Désactive le bouton pendant l'envoi
              >
                {isSubmitting ? 'Envoi en cours...' : 'Envoyer'}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default ContactPage;
