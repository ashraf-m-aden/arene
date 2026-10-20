// Déploiement continu d'Arène sur l'EC2 (job Jenkins « arene-pipeline »).
//
// Un push sur main déclenche ce job par le webhook GitHub. Les images sont
// construites par GitHub Actions (build-and-push.yml) : ce job attend que le
// CI du commit soit vert et ses images sur Docker Hub, puis les déploie avec
// docker/scripts/deploy.sh, qui revient au tag précédent en cas d'échec.
//
// Indépendant des jobs Totalis : autre dépôt, autre verrou, aucun fichier
// commun. Les commandes tournent en tant que ubuntu, propriétaire de ~/arene.
pipeline {
    agent any

    environment {
        ARENE_REPO = '/home/ubuntu/arene/repo'
    }

    options {
        disableConcurrentBuilds()
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    triggers {
        githubPush()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.SHA_SHORT = env.GIT_COMMIT.take(7)
                    echo "Commit : ${env.SHA_SHORT}"
                }
            }
        }

        stage('Attente des images') {
            steps {
                sh "sh docker/scripts/wait-image.sh ${env.GIT_COMMIT} 2100"
            }
        }

        stage('Sync ~/arene/repo') {
            steps {
                // Le compose et les scripts déployés sont ceux du commit testé.
                sh """
                    sudo -u ubuntu -H sh -c '
                        cd ${env.ARENE_REPO} &&
                        git fetch -q origin main &&
                        git merge -q --ff-only ${env.GIT_COMMIT}
                    '
                """
            }
        }

        stage('Déploiement') {
            steps {
                sh "sudo -u ubuntu -H ${env.ARENE_REPO}/docker/scripts/deploy.sh ${env.SHA_SHORT}"
            }
        }
    }
}
