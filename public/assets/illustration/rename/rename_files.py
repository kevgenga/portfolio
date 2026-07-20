import os

# Chemin du répertoire contenant les fichiers
folder_path = 'C:/mon-portfolio/public/assets/illustration/Nouveau dossier'  # Remplacez par le chemin réel

# Fonction pour renommer les fichiers
def rename_files(folder_path):
    for filename in os.listdir(folder_path):
        if filename.endswith('.jpg'):  # Vérifie si le fichier est une image
            new_name = filename
            
            # Remplacer toutes les occurrences du même motif
            while 'penup_09-01-2022-penup_09-01-2022' in new_name:  # Ajouter la gestion pour penup_14-01-2022
                new_name = new_name.replace('penup_09-01-2022-penup_09-01-2022', 'penup_09-01-2022')

            # Construire le chemin complet des fichiers
            old_file = os.path.join(folder_path, filename)
            new_file = os.path.join(folder_path, new_name)

            # Renommer le fichier
            os.rename(old_file, new_file)
            print(f"Renommé: {filename} -> {new_name}")

# Exécuter la fonction
rename_files(folder_path)
